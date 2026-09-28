"""AI add-on advisor.

The rule engine decides which add-ons are available and what each costs; the
LLM only chooses among them and explains why. Its output is validated against
the database prices: an unknown add-on, a wrong price, or a rupee amount in the
text that doesn't match a listed price makes the response invalid. Invalid
responses get one retry with the errors fed back, then fall back to the
deterministic rule-based recommendations.
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass
from datetime import date
from decimal import Decimal, InvalidOperation
from typing import Any, Callable

from sqlalchemy.orm import Session

from calculator import (
    addon_ineligibility_reason,
    calculate_addon_price,
    calculate_idv,
    find_depreciation_slab,
    find_ncb_slab,
    is_flood_prone,
    load_reference_data,
    recommended_addons,
    resolve_vehicle_age,
    round_money,
)
from llm import LLMUnavailableError, deployment_name, get_chat_completion

MAX_ATTEMPTS = 2

SYSTEM_PROMPT = """You are an insurance add-on advisor. You are given a vehicle profile, \
city, and the list of AVAILABLE addons with their exact prices from the database. \
You must only recommend from this list, using their exact stated prices. Explain \
your reasoning in 1-2 sentences per recommendation. Do not invent prices, do not \
recommend add-ons not in the provided list, do not state a price different from \
what's given.

Additional rules:
- Every add-on in the list must appear exactly once, either in "recommendations" or \
in "not_recommended".
- Use the add-on "name" exactly as given.
- "price" must be copied exactly from the list. Do not mention any other rupee amount, \
total, discount or saving anywhere in your text.
- Base your reasoning only on the vehicle profile, city and each add-on's \
applicability_note.

Respond with a JSON object only, in this shape:
{
  "recommendations": [{"name": "<addon name>", "price": <exact price>, "reasoning": "<1-2 sentences>"}],
  "not_recommended": [{"name": "<addon name>", "reasoning": "<1 sentence>"}],
  "summary": "<1-2 sentences, no rupee amounts>"
}"""

CURRENCY_AMOUNT_RE = re.compile(r"(?:₹|\brs\.?|\binr)\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)", re.IGNORECASE)


@dataclass(frozen=True)
class AvailableAddon:
    addon_id: int
    addon_name: str
    price: Decimal
    formula: str
    applicability_note: str | None


class InvalidAdvice(ValueError):
    def __init__(self, errors: list[str]) -> None:
        super().__init__("; ".join(errors))
        self.errors = errors


# --------------------------------------------------------------------------- #
# Deterministic context
# --------------------------------------------------------------------------- #

def build_addon_context(
    vehicle: Any,
    city: str,
    db: Session,
    registration_date: date | None = None,
    as_of: date | None = None,
    claim_free_years: int = 0,
    insurer: str | None = None,
) -> dict[str, Any]:
    """Vehicle profile plus available / unavailable add-ons with exact prices.

    Add-on prices depend on IDV, so vehicles too old for automatic IDV raise
    ValueError (same rule as the calculator).
    """
    ref = load_reference_data(db, insurer=insurer)
    age_months, age_basis = resolve_vehicle_age(vehicle, registration_date=registration_date, as_of=as_of)
    slab = find_depreciation_slab(age_months, ref.depreciation_slabs)
    idv = calculate_idv(vehicle.ex_showroom_price, age_months, ref.depreciation_slabs)

    available: list[AvailableAddon] = []
    unavailable: list[dict[str, Any]] = []
    for addon in sorted(ref.addons, key=lambda a: a.addon_id):
        reason = addon_ineligibility_reason(addon, age_months, vehicle.fuel_type)
        if reason:
            unavailable.append({"addon_id": addon.addon_id, "addon_name": addon.addon_name, "reason": reason})
            continue
        price = calculate_addon_price(addon, idv)
        rule = addon.price_rule
        formula = (
            f"flat {price:,.2f}" if rule.startswith("flat_")
            else f"{idv:,.2f} x {rule.removeprefix('pct_of_idv_')}% = {price:,.2f}"
        )
        available.append(AvailableAddon(addon.addon_id, addon.addon_name, price, formula, addon.applicability_note))

    rule_picks = recommended_addons(ref.addons, age_months, vehicle.fuel_type, city, claim_free_years)
    ncb_slab = find_ncb_slab(claim_free_years, ref.ncb_slabs)
    ncb_pct = ncb_slab.ncb_discount_pct if ncb_slab else 0
    profile = {
        "vehicle_id": vehicle.vehicle_id,
        "vehicle": f"{vehicle.make} {vehicle.model} {vehicle.year}",
        "fuel_type": vehicle.fuel_type,
        "engine_cc": vehicle.engine_cc,
        "vehicle_age_months": age_months,
        "age_basis": age_basis,
        "city": city,
        "flood_prone_city": is_flood_prone(city),
        "depreciation_pct": slab.depreciation_pct,
        "idv": idv,
        "claim_free_years": claim_free_years,
        "ncb_discount_pct": ncb_pct,
        "insurer": insurer,
    }
    return {
        "profile": profile,
        "available": available,
        "unavailable": unavailable,
        "rule_picks": [(a.addon_id, reason) for a, reason in rule_picks],
        "addons": ref.addons,
    }


def build_messages(profile: dict[str, Any], available: list[AvailableAddon]) -> list[dict[str, str]]:
    years, months = divmod(profile["vehicle_age_months"], 12)
    age_text = f"{years} year(s) {months} month(s) old" if years else f"{months} month(s) old"
    vehicle_line = (
        f"Vehicle: {profile['vehicle']}, {age_text}, {profile['fuel_type']}, {profile['city']}"
        f" ({'flood-prone city' if profile['flood_prone_city'] else 'not a flood-prone city'})."
        f" Insurer: {profile.get('insurer') or 'not specified'}."
        f" Claim-free years: {profile.get('claim_free_years', 0)}"
        f" (NCB {profile.get('ncb_discount_pct') or 0}% on own-damage premium)."
        f" Prefer add-ons that match this NCB level; do not invent prices."
    )
    addons_json = json.dumps(
        [
            {"name": a.addon_name, "price": float(a.price), "applicability_note": a.applicability_note}
            for a in available
        ],
        ensure_ascii=False,
    )
    return [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": f"{vehicle_line} Available addons: {addons_json}"},
    ]


# --------------------------------------------------------------------------- #
# Validation
# --------------------------------------------------------------------------- #

def _to_money(value: Any) -> Decimal | None:
    try:
        return round_money(str(value).replace(",", ""))
    except (InvalidOperation, ValueError):
        return None


def _foreign_amounts(text: str, allowed: set[Decimal]) -> list[str]:
    bad: list[str] = []
    for match in CURRENCY_AMOUNT_RE.finditer(text or ""):
        amount = _to_money(match.group(1))
        if amount is None or amount not in allowed:
            bad.append(match.group(0).strip())
    return bad


def validate_advice(raw: Any, available: list[AvailableAddon]) -> dict[str, Any]:
    """Check LLM output against the available add-ons and exact prices.

    Returns the cleaned advice (prices taken from the database) or raises
    InvalidAdvice listing every problem found.
    """
    if not isinstance(raw, dict):
        raise InvalidAdvice(["Response is not a JSON object."])

    by_name = {a.addon_name: a for a in available}
    allowed_prices = {a.price for a in available}
    errors: list[str] = []
    seen: set[str] = set()

    def check_text(label: str, text: Any) -> str:
        if not isinstance(text, str) or not text.strip():
            errors.append(f"{label}: reasoning is missing.")
            return ""
        for amount in _foreign_amounts(text, allowed_prices):
            errors.append(f"{label}: mentions amount '{amount}' which is not a listed price.")
        return text.strip()

    recommendations: list[dict[str, Any]] = []
    for item in raw.get("recommendations") or []:
        name = item.get("name") if isinstance(item, dict) else None
        if name not in by_name:
            errors.append(f"Recommended add-on '{name}' is not in the available list.")
            continue
        if name in seen:
            errors.append(f"Add-on '{name}' appears more than once.")
            continue
        seen.add(name)
        addon = by_name[name]
        stated = _to_money(item.get("price"))
        if stated != addon.price:
            errors.append(f"Price for '{name}' is {item.get('price')!r} but the listed price is {addon.price}.")
        reasoning = check_text(name, item.get("reasoning"))
        recommendations.append({
            "addon_id": addon.addon_id,
            "addon_name": name,
            "price": addon.price,
            "reasoning": reasoning,
        })

    not_recommended: list[dict[str, Any]] = []
    for item in raw.get("not_recommended") or []:
        name = item.get("name") if isinstance(item, dict) else None
        if name not in by_name:
            errors.append(f"Not-recommended add-on '{name}' is not in the available list.")
            continue
        if name in seen:
            errors.append(f"Add-on '{name}' appears more than once.")
            continue
        seen.add(name)
        reasoning = check_text(name, item.get("reasoning"))
        not_recommended.append({"addon_id": by_name[name].addon_id, "addon_name": name, "reasoning": reasoning})

    missing = [a.addon_name for a in available if a.addon_name not in seen]
    if missing:
        errors.append(f"These add-ons were not assessed: {', '.join(missing)}.")

    summary = raw.get("summary") if isinstance(raw.get("summary"), str) else ""
    for amount in _foreign_amounts(summary, set()):
        errors.append(f"summary: mentions amount '{amount}'; the summary must not contain rupee amounts.")

    if errors:
        raise InvalidAdvice(errors)
    return {"recommendations": recommendations, "not_recommended": not_recommended, "summary": summary.strip()}


# --------------------------------------------------------------------------- #
# Orchestration
# --------------------------------------------------------------------------- #

def _rule_based_advice(context: dict[str, Any]) -> dict[str, Any]:
    reasons = dict(context["rule_picks"])
    recommendations, not_recommended = [], []
    for a in context["available"]:
        if a.addon_id in reasons:
            reason = reasons[a.addon_id]
            recommendations.append({
                "addon_id": a.addon_id, "addon_name": a.addon_name, "price": a.price,
                "reasoning": f"Recommended: {reason}.",
            })
        else:
            not_recommended.append({
                "addon_id": a.addon_id, "addon_name": a.addon_name,
                "reasoning": a.applicability_note or "Not recommended by the rule engine for this vehicle.",
            })
    return {
        "recommendations": recommendations,
        "not_recommended": not_recommended,
        "summary": "Recommendations generated by the deterministic rule engine.",
    }


def get_addon_advice(
    vehicle: Any,
    city: str,
    db: Session,
    registration_date: date | None = None,
    as_of: date | None = None,
    chat: Callable[[list[dict[str, str]]], str] = get_chat_completion,
    claim_free_years: int = 0,
    insurer: str | None = None,
) -> dict[str, Any]:
    context = build_addon_context(
        vehicle, city, db, registration_date, as_of,
        claim_free_years=claim_free_years, insurer=insurer,
    )
    available: list[AvailableAddon] = context["available"]
    notes: list[str] = []
    advice: dict[str, Any] | None = None
    source = "rules_fallback"

    if available:
        messages = build_messages(context["profile"], available)
        for attempt in range(1, MAX_ATTEMPTS + 1):
            try:
                content = chat(messages)
            except LLMUnavailableError as exc:
                notes.append(str(exc))
                break
            try:
                advice = validate_advice(json.loads(content), available)
            except json.JSONDecodeError:
                errors = ["Response was not valid JSON."]
            except InvalidAdvice as exc:
                errors = exc.errors
            else:
                source = "ai"
                if attempt > 1:
                    notes.append(f"AI response passed validation on attempt {attempt}.")
                break
            notes.append(f"Attempt {attempt} rejected: {'; '.join(errors)}")
            messages = messages + [
                {"role": "assistant", "content": content},
                {"role": "user", "content": "Your response broke these rules:\n- " + "\n- ".join(errors)
                 + "\nReturn corrected JSON using only the listed add-ons and their exact prices."},
            ]

    if advice is None:
        advice = _rule_based_advice(context)
        if available:
            notes.append("Showing rule-based recommendations instead of AI output.")

    total = round_money(sum((r["price"] for r in advice["recommendations"]), Decimal("0")))
    return {
        **context["profile"],
        "available_addons": [a.__dict__ for a in available],
        "unavailable_addons": context["unavailable"],
        **advice,
        "recommended_total": total,
        "source": source,
        "model": deployment_name() if source == "ai" else None,
        "validation_notes": notes,
    }
