"""Deterministic, rule-based motor insurance premium calculation.

Every figure is produced by an explicit formula with Decimal arithmetic -
nothing is estimated. Money is rounded to 2 decimal places (ROUND_HALF_UP) at
each step, and each later step uses the rounded value, so every number in a
breakdown can be reproduced exactly from the numbers shown before it.

This module only reads reference data (slabs, rate card, add-ons); it never
writes to the database.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from datetime import date
from decimal import ROUND_HALF_UP, Decimal
from types import SimpleNamespace
from typing import Any, Iterable

from sqlalchemy import select
from sqlalchemy.orm import Session

from models import INSURERS, Addon, DepreciationSlab, InsurerAddonPolicy, NcbSlab, RateCard

PAISA = Decimal("0.01")
HUNDRED = Decimal("100")
ZERO = Decimal("0.00")
GST_PCT = Decimal("18")

# --------------------------------------------------------------------------- #
# Reference rules
# --------------------------------------------------------------------------- #

ZONE_A = "zone_a_mumbai_delhi"
ZONE_B = "zone_b_tier2"
ZONE_C = "zone_c_other"
CITY_ZONES: tuple[str, ...] = (ZONE_A, ZONE_B, ZONE_C)

# Metro cities (IRDAI tariff Zone A list); everything else in ZONE_B_CITIES is
# tier-2, and any other city falls into zone C.
ZONE_A_CITIES: frozenset[str] = frozenset({
    "mumbai", "delhi", "new delhi", "kolkata", "chennai", "bengaluru",
    "bangalore", "hyderabad", "ahmedabad", "pune",
})
ZONE_B_CITIES: frozenset[str] = frozenset({
    "jaipur", "lucknow", "chandigarh", "indore", "nagpur", "surat", "kochi",
    "coimbatore", "bhopal", "vadodara", "visakhapatnam", "patna", "nashik",
    "ludhiana", "kanpur", "thane", "navi mumbai", "gurugram", "gurgaon", "noida",
    "ghaziabad", "faridabad", "mysuru", "mysore", "madurai", "guwahati",
    "bhubaneswar", "dehradun", "raipur", "ranchi", "thiruvananthapuram",
})
FLOOD_PRONE_CITIES: frozenset[str] = frozenset({
    "mumbai", "thane", "navi mumbai", "chennai", "kolkata", "kochi", "guwahati",
    "patna", "surat", "hyderabad", "bengaluru", "bangalore", "bhubaneswar",
    "thiruvananthapuram", "vadodara",
})

CC_BAND_BELOW_1000 = "below_1000"
CC_BAND_1000_1500 = "1000_1500"
CC_BAND_ABOVE_1500 = "above_1500"

PRICE_RULE_RE = re.compile(r"^(?P<kind>flat|pct_of_idv)_(?P<value>\d+(?:\.\d+)?)$")
DEFAULT_INSURER = "HDFC ERGO"


def rule_for(addon: Any) -> AddonRule | None:
    """Insurer policy loaded onto the addon, else the generic ADDON_RULES fallback."""
    if getattr(addon, "policy_loaded", False):
        fuels = addon.excluded_fuel_types or ()
        return AddonRule(
            max_vehicle_age_months=addon.max_vehicle_age_months,
            excluded_fuel_types=frozenset(fuels),
            recommend_only_in_flood_prone_city=bool(addon.recommend_only_in_flood_prone_city),
            min_claim_free_years=int(addon.min_claim_free_years or 0),
            reason=addon.reason or "",
        )
    return ADDON_RULES.get(addon.addon_name)


@dataclass(frozen=True)
class AddonRule:
    """Eligibility and recommendation rules for an add-on, keyed by addon_name."""

    max_vehicle_age_months: int | None = None
    excluded_fuel_types: frozenset[str] = frozenset()
    recommend_only_in_flood_prone_city: bool = False
    min_claim_free_years: int = 0
    reason: str = ""


ADDON_RULES: dict[str, AddonRule] = {
    "zero_depreciation": AddonRule(
        max_vehicle_age_months=60,
        min_claim_free_years=0,
        reason="vehicle is 5 years old or newer, so parts depreciation would otherwise reduce claims",
    ),
    "roadside_assistance": AddonRule(
        min_claim_free_years=0,
        reason="useful for every vehicle regardless of age",
    ),
    "engine_protection": AddonRule(
        max_vehicle_age_months=60,
        excluded_fuel_types=frozenset({"electric"}),
        recommend_only_in_flood_prone_city=True,
        min_claim_free_years=0,
        reason="city is flood-prone and water ingress engine damage is excluded from base OD cover",
    ),
    "consumables_cover": AddonRule(
        max_vehicle_age_months=60,
        min_claim_free_years=1,
        reason="suggested once you have at least 1 claim-free year; consumables are excluded from base OD cover",
    ),
    "return_to_invoice": AddonRule(
        max_vehicle_age_months=36,
        min_claim_free_years=2,
        reason="suggested from 2 claim-free years so a total-loss payout can be restored to invoice value",
    ),
    "key_replacement": AddonRule(
        min_claim_free_years=0,
        reason="modern keys and fobs are expensive to replace",
    ),
}


# --------------------------------------------------------------------------- #
# Helpers
# --------------------------------------------------------------------------- #

def to_decimal(value: Any) -> Decimal:
    """Convert int/float/str/Decimal to Decimal without float artefacts."""
    if isinstance(value, Decimal):
        return value
    return Decimal(str(value))


def round_money(value: Any) -> Decimal:
    """Round to 2 decimal places, half-up (e.g. 10.005 -> 10.01)."""
    return to_decimal(value).quantize(PAISA, rounding=ROUND_HALF_UP)


def _fmt(value: Decimal) -> str:
    return f"{value:,.2f}"


def _pct(value: Decimal) -> str:
    return f"{value.normalize():f}%"


def city_zone_for(city: str) -> str:
    """Map a city name to its rate-card zone."""
    key = city.strip().lower()
    if key in ZONE_A_CITIES:
        return ZONE_A
    if key in ZONE_B_CITIES:
        return ZONE_B
    return ZONE_C


def is_flood_prone(city: str | None) -> bool:
    return bool(city) and city.strip().lower() in FLOOD_PRONE_CITIES


def cc_band_for(engine_cc: int) -> str:
    """below_1000: < 1000 cc; 1000_1500: 1000-1500 cc; above_1500: > 1500 cc.

    Electric vehicles are stored with engine_cc = 0 and fall in below_1000.
    """
    if engine_cc < 0:
        raise ValueError(f"engine_cc cannot be negative (got {engine_cc}).")
    if engine_cc < 1000:
        return CC_BAND_BELOW_1000
    if engine_cc <= 1500:
        return CC_BAND_1000_1500
    return CC_BAND_ABOVE_1500


def vehicle_age_in_months(registration_date: date, as_of: date) -> int:
    """Completed months between registration and `as_of` (partial months not counted)."""
    months = (as_of.year - registration_date.year) * 12 + (as_of.month - registration_date.month)
    if as_of.day < registration_date.day:
        months -= 1
    if months < 0:
        raise ValueError(
            f"Registration date {registration_date.isoformat()} is after the quote date {as_of.isoformat()}."
        )
    return months


def find_depreciation_slab(vehicle_age_months: int, depreciation_slabs: Iterable[Any]) -> Any:
    """Slab whose inclusive [age_min_months, age_max_months] range contains the age."""
    if vehicle_age_months < 0:
        raise ValueError(f"Vehicle age cannot be negative (got {vehicle_age_months} months).")
    for slab in depreciation_slabs:
        if slab.age_min_months <= vehicle_age_months <= slab.age_max_months:
            return slab
    raise ValueError(
        f"No depreciation slab covers a vehicle age of {vehicle_age_months} months. "
        "Vehicles older than the highest slab (60 months) need a mutually agreed IDV "
        "and cannot be priced automatically."
    )


def find_ncb_slab(claim_free_years: int, ncb_slabs: Iterable[Any]) -> Any | None:
    """Highest slab with claim_free_years <= the given years (5+ years -> top slab)."""
    if claim_free_years < 0:
        raise ValueError(f"claim_free_years cannot be negative (got {claim_free_years}).")
    eligible = [s for s in ncb_slabs if s.claim_free_years <= claim_free_years]
    return max(eligible, key=lambda s: s.claim_free_years) if eligible else None


def find_rate_card_row(
    city_zone: str, cc_band: str, rate_cards: Iterable[Any], insurer: str | None = None,
) -> Any:
    rows = [
        row for row in rate_cards
        if row.city_zone == city_zone and row.cc_band == cc_band
    ]
    if insurer:
        tagged = [row for row in rows if getattr(row, "insurer", None) == insurer]
        if tagged:
            rows = tagged
    if not rows:
        who = f" insurer='{insurer}'," if insurer else ""
        raise ValueError(
            f"No rate_card row found for{who} city_zone='{city_zone}' and cc_band='{cc_band}'. "
            "Add the missing rate before quoting."
        )
    return rows[0]


def addon_ineligibility_reason(
    addon: Any, vehicle_age_months: int, fuel_type: str
) -> str | None:
    """Why an add-on cannot be sold for this vehicle, or None if it can."""
    rule = rule_for(addon)
    if rule is None:
        return None
    if fuel_type in rule.excluded_fuel_types:
        return f"{addon.addon_name} is not available for {fuel_type} vehicles"
    if rule.max_vehicle_age_months is not None and vehicle_age_months > rule.max_vehicle_age_months:
        return (
            f"{addon.addon_name} is only available for vehicles up to "
            f"{rule.max_vehicle_age_months} months old (vehicle is {vehicle_age_months} months)"
        )
    return None


def recommended_addons(
    addons: Iterable[Any], vehicle_age_months: int, fuel_type: str, city: str | None,
    claim_free_years: int = 0,
) -> list[tuple[Any, str]]:
    """Add-ons recommended for the Premium plan, each with the rule that selected it.

    An add-on is recommended when it has a rule in ADDON_RULES, the vehicle is
    eligible, NCB (claim-free years) meets min_claim_free_years, and (for
    flood-only add-ons) the city is flood-prone.
    """
    picks: list[tuple[Any, str]] = []
    for addon in sorted(addons, key=lambda a: a.addon_id):
        rule = rule_for(addon)
        if rule is None:
            continue
        if addon_ineligibility_reason(addon, vehicle_age_months, fuel_type):
            continue
        if rule.recommend_only_in_flood_prone_city and not is_flood_prone(city):
            continue
        if claim_free_years < rule.min_claim_free_years:
            continue
        picks.append((addon, rule.reason))
    return picks


# --------------------------------------------------------------------------- #
# Core formulas
# --------------------------------------------------------------------------- #

def calculate_idv(
    ex_showroom_price: Decimal | float,
    vehicle_age_months: int,
    depreciation_slabs: list[Any],
) -> Decimal:
    """Insured's Declared Value.

    IDV = ex_showroom_price x (1 - depreciation_pct / 100)

    depreciation_pct comes from the slab whose inclusive age range contains
    `vehicle_age_months`. Raises ValueError if no slab matches (> 60 months).
    """
    slab = find_depreciation_slab(vehicle_age_months, depreciation_slabs)
    price = to_decimal(ex_showroom_price)
    return round_money(price * (1 - to_decimal(slab.depreciation_pct) / HUNDRED))


def calculate_od_premium(idv: Decimal | float, rate_card_row: Any) -> Decimal:
    """Own Damage premium.

    od_premium = IDV x (od_rate_pct / 100)
    """
    return round_money(to_decimal(idv) * to_decimal(rate_card_row.od_rate_pct) / HUNDRED)


def calculate_ncb_discount(
    od_premium: Decimal | float,
    claim_free_years: int,
    ncb_slabs: list[Any],
) -> Decimal:
    """No Claim Bonus discount AMOUNT (applies to OD premium only).

    ncb_discount_amount = od_premium x (ncb_discount_pct / 100)

    Uses the highest slab with claim_free_years <= the given value, so 5+
    claim-free years earn the top (50%) slab. Returns 0.00 when there is no
    matching slab (e.g. 0 claim-free years).
    """
    slab = find_ncb_slab(claim_free_years, ncb_slabs)
    if slab is None:
        return ZERO
    return round_money(to_decimal(od_premium) * to_decimal(slab.ncb_discount_pct) / HUNDRED)


def calculate_addon_price(addon: Any, idv: Decimal | float) -> Decimal:
    """Price of one add-on from its price_rule.

    "flat_X"        -> X
    "pct_of_idv_X"  -> IDV x X / 100

    Raises ValueError for any other rule format.
    """
    match = PRICE_RULE_RE.match(addon.price_rule.strip())
    if not match:
        raise ValueError(
            f"Invalid price_rule '{addon.price_rule}' for add-on '{addon.addon_name}'. "
            "Expected 'flat_<amount>' or 'pct_of_idv_<percent>'."
        )
    value = Decimal(match.group("value"))
    if match.group("kind") == "flat":
        return round_money(value)
    return round_money(to_decimal(idv) * value / HUNDRED)


# --------------------------------------------------------------------------- #
# Orchestration
# --------------------------------------------------------------------------- #

@dataclass(frozen=True)
class ReferenceData:
    depreciation_slabs: list[DepreciationSlab]
    rate_cards: list[RateCard]
    ncb_slabs: list[NcbSlab]
    addons: list[Addon]
    addon_policies: list[InsurerAddonPolicy] = field(default_factory=list)


def _apply_policy(addon: Any, policy: Any | None) -> Any:
    if policy is None:
        return addon
    fuels = policy.excluded_fuel_types or []
    if isinstance(fuels, str):
        fuels = [part for part in fuels.split(",") if part]
    return SimpleNamespace(
        addon_id=addon.addon_id,
        addon_name=addon.addon_name,
        price_rule=policy.price_rule,
        applicability_note=policy.applicability_note or addon.applicability_note,
        policy_loaded=True,
        max_vehicle_age_months=policy.max_vehicle_age_months,
        excluded_fuel_types=frozenset(fuels),
        recommend_only_in_flood_prone_city=bool(policy.recommend_only_in_flood_prone_city),
        min_claim_free_years=int(policy.min_claim_free_years or 0),
        reason=policy.recommendation_reason or "",
    )


def apply_insurer(ref: ReferenceData, insurer: str | None) -> ReferenceData:
    """Filter rate cards and overlay add-on terms for one policy provider."""
    name = insurer or DEFAULT_INSURER
    tagged = [row for row in ref.rate_cards if getattr(row, "insurer", None)]
    if tagged:
        rates = [row for row in tagged if row.insurer == name]
        if not rates:
            raise ValueError(
                f"No rate_card rows found for insurer '{name}'. Seed insurer rate cards before quoting."
            )
    else:
        rates = list(ref.rate_cards)

    policy_map = {
        p.addon_id: p for p in ref.addon_policies
        if getattr(p, "insurer", None) == name
    }
    addons = [_apply_policy(addon, policy_map.get(addon.addon_id)) for addon in ref.addons]
    return ReferenceData(
        depreciation_slabs=ref.depreciation_slabs,
        rate_cards=rates,
        ncb_slabs=ref.ncb_slabs,
        addons=addons,
        addon_policies=list(policy_map.values()),
    )


def load_reference_data(db_session: Session, insurer: str | None = None) -> ReferenceData:
    """Read all pricing reference tables in one go (read-only)."""
    ref = ReferenceData(
        depreciation_slabs=list(db_session.scalars(select(DepreciationSlab))),
        rate_cards=list(db_session.scalars(select(RateCard))),
        ncb_slabs=list(db_session.scalars(select(NcbSlab))),
        addons=list(db_session.scalars(select(Addon).order_by(Addon.addon_id))),
        addon_policies=list(db_session.scalars(select(InsurerAddonPolicy))),
    )
    return apply_insurer(ref, insurer) if insurer else ref


def resolve_vehicle_age(
    vehicle: Any,
    vehicle_age_months: int | None = None,
    registration_date: date | None = None,
    as_of: date | None = None,
) -> tuple[int, str]:
    """Return (age in completed months, basis used).

    Priority: explicit vehicle_age_months, then registration_date, then
    1 January of the vehicle's model year.
    """
    as_of = as_of or date.today()
    if vehicle_age_months is not None:
        if vehicle_age_months < 0:
            raise ValueError("vehicle_age_months cannot be negative.")
        return vehicle_age_months, "provided_age_months"
    if registration_date is not None:
        return vehicle_age_in_months(registration_date, as_of), f"registration_date {registration_date.isoformat()}"
    assumed = date(vehicle.year, 1, 1)
    return vehicle_age_in_months(assumed, as_of), f"assumed registration {assumed.isoformat()} (model year)"


def calculate_full_quote(
    vehicle: Any,
    city_zone: str,
    claim_free_years: int,
    selected_addon_ids: list[int],
    db_session: Session,
    *,
    include_own_damage: bool = True,
    plan_tier: str | None = None,
    city: str | None = None,
    vehicle_age_months: int | None = None,
    registration_date: date | None = None,
    as_of: date | None = None,
    reference: ReferenceData | None = None,
    addon_reasons: dict[int, str] | None = None,
    insurer: str | None = None,
) -> dict[str, Any]:
    """Itemised premium for one vehicle / zone / NCB / add-on selection.

    total_premium = (od_premium - ncb_discount_amount) + tp_premium + sum(addon prices)
    gst_amount    = total_premium x GST_PCT/100
    total_payable = total_premium + gst_amount

    where
        IDV                 = ex_showroom_price x (1 - depreciation_pct/100)
        od_premium          = IDV x od_rate_pct/100
        ncb_discount_amount = od_premium x ncb_discount_pct/100
        tp_premium          = rate_card.tp_premium_flat for the zone + cc band
        addon price         = flat amount, or IDV x pct/100

    With include_own_damage=False (third-party-only cover) IDV, OD, NCB and
    add-ons are all 0, and no depreciation slab is needed.

    Returns every intermediate value plus a human-readable formula_trace.
    Raises ValueError for unknown zone/cc band rates, missing add-ons,
    ineligible add-ons, or vehicles too old to depreciate automatically.
    """
    if city_zone not in CITY_ZONES:
        raise ValueError(f"Unknown city_zone '{city_zone}'. Expected one of: {', '.join(CITY_ZONES)}.")
    if claim_free_years < 0:
        raise ValueError("claim_free_years cannot be negative.")

    ref = apply_insurer(reference or load_reference_data(db_session), insurer)
    age_months, age_basis = resolve_vehicle_age(vehicle, vehicle_age_months, registration_date, as_of)
    cc_band = cc_band_for(vehicle.engine_cc)
    rate_row = find_rate_card_row(city_zone, cc_band, ref.rate_cards, insurer)
    ex_showroom = round_money(vehicle.ex_showroom_price)

    selected_ids = list(dict.fromkeys(selected_addon_ids or []))
    if selected_ids and not include_own_damage:
        raise ValueError("Add-ons require Own Damage cover and cannot be added to a third-party-only plan.")
    addons_by_id = {a.addon_id: a for a in ref.addons}
    missing = [i for i in selected_ids if i not in addons_by_id]
    if missing:
        raise ValueError(f"Unknown addon_id(s): {', '.join(map(str, missing))}.")

    trace: list[str] = [
        f"Insurer = {insurer or DEFAULT_INSURER}",
        f"Vehicle age = {age_months} completed months ({age_basis})",
        f"cc band = {cc_band} (engine {vehicle.engine_cc} cc); zone = {city_zone}",
    ]

    if include_own_damage:
        slab = find_depreciation_slab(age_months, ref.depreciation_slabs)
        depreciation_pct = to_decimal(slab.depreciation_pct)
        idv = calculate_idv(ex_showroom, age_months, ref.depreciation_slabs)
        od_rate_pct = to_decimal(rate_row.od_rate_pct)
        od_premium = calculate_od_premium(idv, rate_row)
        ncb_slab = find_ncb_slab(claim_free_years, ref.ncb_slabs)
        ncb_pct = to_decimal(ncb_slab.ncb_discount_pct) if ncb_slab else Decimal("0")
        ncb_amount = calculate_ncb_discount(od_premium, claim_free_years, ref.ncb_slabs)
        trace += [
            f"IDV = {_fmt(ex_showroom)} x (1 - {_pct(depreciation_pct)}) = {_fmt(idv)} "
            f"(slab {slab.age_min_months}-{slab.age_max_months} months)",
            f"OD premium = {_fmt(idv)} x {_pct(od_rate_pct)} = {_fmt(od_premium)}",
            f"NCB = {_fmt(od_premium)} x {_pct(ncb_pct)} = {_fmt(ncb_amount)} "
            f"({claim_free_years} claim-free year(s))",
        ]
    else:
        depreciation_pct = None
        idv = od_premium = ncb_amount = ZERO
        od_rate_pct = to_decimal(rate_row.od_rate_pct)
        ncb_pct = Decimal("0")
        trace.append("Own Damage not included (third-party only): IDV, OD premium and NCB = 0.00")

    net_od_premium = round_money(od_premium - ncb_amount)
    tp_premium = round_money(rate_row.tp_premium_flat)
    trace += [
        f"Net OD premium = {_fmt(od_premium)} - {_fmt(ncb_amount)} = {_fmt(net_od_premium)}",
        f"TP premium = {_fmt(tp_premium)} (flat for {cc_band})",
    ]

    addon_breakdown: list[dict[str, Any]] = []
    for addon_id in selected_ids:
        addon = addons_by_id[addon_id]
        reason = addon_ineligibility_reason(addon, age_months, vehicle.fuel_type)
        if reason:
            raise ValueError(f"Add-on not allowed: {reason}.")
        price = calculate_addon_price(addon, idv)
        match = PRICE_RULE_RE.match(addon.price_rule.strip())
        if match and match.group("kind") == "pct_of_idv":
            formula = f"{_fmt(idv)} x {match.group('value')}% = {_fmt(price)}"
        else:
            formula = f"flat {_fmt(price)}"
        addon_breakdown.append({
            "addon_id": addon.addon_id,
            "addon_name": addon.addon_name,
            "price_rule": addon.price_rule,
            "price": price,
            "formula": formula,
            "recommendation_reason": (addon_reasons or {}).get(addon.addon_id),
        })
        trace.append(f"Add-on {addon.addon_name} = {formula}")

    addons_total = round_money(sum((a["price"] for a in addon_breakdown), ZERO))
    total_premium = round_money(net_od_premium + tp_premium + addons_total)
    gst_amount = round_money(total_premium * GST_PCT / HUNDRED)
    total_payable = round_money(total_premium + gst_amount)
    trace += [
        f"Total = {_fmt(net_od_premium)} + {_fmt(tp_premium)} + {_fmt(addons_total)} = {_fmt(total_premium)}",
        f"GST = {_fmt(total_premium)} x {_pct(GST_PCT)} = {_fmt(gst_amount)}",
        f"Total payable = {_fmt(total_premium)} + {_fmt(gst_amount)} = {_fmt(total_payable)}",
    ]

    return {
        "plan_tier": plan_tier,
        "insurer": insurer or DEFAULT_INSURER,
        "vehicle_id": vehicle.vehicle_id,
        "vehicle": f"{vehicle.make} {vehicle.model} {vehicle.year} ({vehicle.fuel_type})",
        "city": city,
        "city_zone": city_zone,
        "cc_band": cc_band,
        "vehicle_age_months": age_months,
        "age_basis": age_basis,
        "ex_showroom_price": ex_showroom,
        "depreciation_pct": depreciation_pct,
        "idv": idv,
        "od_rate_pct": od_rate_pct,
        "od_premium": od_premium,
        "claim_free_years": claim_free_years,
        "ncb_discount_pct": ncb_pct,
        "ncb_discount_amount": ncb_amount,
        "net_od_premium": net_od_premium,
        "tp_premium": tp_premium,
        "addon_breakdown": addon_breakdown,
        "addons_total": addons_total,
        "total_premium": total_premium,
        "gst_pct": GST_PCT,
        "gst_amount": gst_amount,
        "total_payable": total_payable,
        "formula_trace": trace,
    }


def calculate_all_three_plans(
    vehicle: Any,
    city_zone: str,
    claim_free_years: int,
    db_session: Session,
    *,
    city: str | None = None,
    vehicle_age_months: int | None = None,
    registration_date: date | None = None,
    as_of: date | None = None,
    reference: ReferenceData | None = None,
    premium_addon_ids: list[int] | None = None,
    insurer: str | None = None,
) -> dict[str, dict[str, Any]]:
    """Basic, Standard and Premium quotes for the same inputs.

    basic    : third-party only (no OD, no NCB, no add-ons)
    standard : OD + TP with NCB, no add-ons
    premium  : OD + TP with NCB + premium_addon_ids, or (when None) the add-ons
               recommended by this insurer's add-on policy for age, fuel, city and NCB
    """
    ref = apply_insurer(reference or load_reference_data(db_session), insurer)
    age_months, _ = resolve_vehicle_age(vehicle, vehicle_age_months, registration_date, as_of)
    common: dict[str, Any] = {
        "city": city,
        "vehicle_age_months": vehicle_age_months,
        "registration_date": registration_date,
        "as_of": as_of,
        "reference": ref,
        "insurer": insurer,
    }

    picks = recommended_addons(ref.addons, age_months, vehicle.fuel_type, city, claim_free_years)
    reasons = {addon.addon_id: reason for addon, reason in picks}
    if premium_addon_ids is None:
        premium_ids = [addon.addon_id for addon, _ in picks]
    else:
        premium_ids = list(premium_addon_ids)

    return {
        "basic": calculate_full_quote(
            vehicle, city_zone, claim_free_years, [], db_session,
            include_own_damage=False, plan_tier="basic", **common,
        ),
        "standard": calculate_full_quote(
            vehicle, city_zone, claim_free_years, [], db_session,
            plan_tier="standard", **common,
        ),
        "premium": calculate_full_quote(
            vehicle, city_zone, claim_free_years, premium_ids, db_session,
            plan_tier="premium", addon_reasons=reasons, **common,
        ),
    }


def compare_insurer_quotes(
    vehicle: Any,
    city: str,
    claim_free_years: int,
    selected_addon_ids: list[int] | None,
    db_session: Session,
    *,
    registration_date: date | None = None,
    as_of: date | None = None,
    reference: ReferenceData | None = None,
) -> dict[str, Any]:
    """Premium (with requested add-ons) for every insurer, plus standard for context.

    Add-ons that an insurer cannot sell are skipped for that insurer only; the
    others are still priced. Each row includes the formula trace and the
    insurer's own add-on wording.
    """
    ref_all = reference or load_reference_data(db_session)
    city_zone = city_zone_for(city)
    age_months, _ = resolve_vehicle_age(vehicle, registration_date=registration_date, as_of=as_of)
    requested = list(dict.fromkeys(selected_addon_ids or []))
    providers: list[dict[str, Any]] = []

    for insurer in INSURERS:
        ref = apply_insurer(ref_all, insurer)
        addons_by_id = {a.addon_id: a for a in ref.addons}
        applied: list[int] = []
        skipped: list[dict[str, Any]] = []
        picks = {a.addon_id: reason for a, reason in recommended_addons(
            ref.addons, age_months, vehicle.fuel_type, city, claim_free_years
        )}
        for addon_id in requested:
            addon = addons_by_id.get(addon_id)
            if addon is None:
                skipped.append({"addon_id": addon_id, "addon_name": str(addon_id), "reason": "Unknown add-on"})
                continue
            blocked = addon_ineligibility_reason(addon, age_months, vehicle.fuel_type)
            if blocked:
                skipped.append({"addon_id": addon_id, "addon_name": addon.addon_name, "reason": blocked})
                continue
            applied.append(addon_id)
        plans = calculate_all_three_plans(
            vehicle, city_zone, claim_free_years, db_session,
            city=city, registration_date=registration_date, as_of=as_of,
            reference=ref_all, premium_addon_ids=applied, insurer=insurer,
        )
        premium = plans["premium"]
        notes = []
        for line in premium["addon_breakdown"]:
            addon = addons_by_id.get(line["addon_id"])
            notes.append({
                "addon_id": line["addon_id"],
                "addon_name": line["addon_name"],
                "price": line["price"],
                "formula": line.get("formula"),
                "applicability_note": getattr(addon, "applicability_note", None),
                "recommended": line["addon_id"] in picks,
                "recommendation_reason": picks.get(line["addon_id"]) or line.get("recommendation_reason"),
            })
        providers.append({
            "insurer": insurer,
            "basic": plans["basic"],
            "standard": plans["standard"],
            "premium": premium,
            "applied_addon_ids": applied,
            "skipped_addons": skipped,
            "addon_notes": notes,
        })

    payables = [p["premium"]["total_payable"] for p in providers]
    lowest = min(payables) if payables else None
    for row in providers:
        payable = row["premium"]["total_payable"]
        row["is_lowest"] = lowest is not None and payable == lowest
        skipped_names = [s["addon_name"] for s in row["skipped_addons"]]
        bits = [
            f"Basic {_fmt(row['basic']['total_payable'])} · "
            f"Standard {_fmt(row['standard']['total_payable'])} · "
            f"Premium {_fmt(row['premium']['total_payable'])} including GST."
        ]
        if row["is_lowest"]:
            bits.append("This is the lowest Premium among the three providers for this selection.")
        if skipped_names:
            bits.append("Not sold by this insurer: " + ", ".join(skipped_names) + ".")
        rec = [n["addon_name"] for n in row["addon_notes"] if n["recommended"]]
        if rec:
            bits.append("Suggested on this policy: " + ", ".join(rec) + ".")
        row["suggestion"] = " ".join(bits)

    return {
        "city": city,
        "city_zone": city_zone,
        "claim_free_years": claim_free_years,
        "vehicle_id": vehicle.vehicle_id,
        "providers": providers,
    }

