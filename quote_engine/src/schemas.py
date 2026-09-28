"""Pydantic request/response models."""

from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, PlainSerializer, model_validator

Money = Annotated[Decimal, PlainSerializer(float, return_type=float, when_used="json")]
Percent = Annotated[Decimal, PlainSerializer(float, return_type=float, when_used="json")]

FuelType = Literal["petrol", "diesel", "electric", "cng"]
PlanTier = Literal["basic", "standard", "premium"]
QuoteStatus = Literal["draft", "sent", "converted"]
InsurerName = Literal["HDFC ERGO", "ICICI Lombard", "Bajaj Allianz"]
EffectiveStatus = Literal["draft", "sent", "converted", "expired"]
LeadStatus = Literal["hot", "warm", "cold"]
Gender = Literal["male", "female", "other"]


# --------------------------------------------------------------------------- #
# Vehicles, add-ons, reference data
# --------------------------------------------------------------------------- #

class VehicleCreate(BaseModel):
    make: str = Field(min_length=1, max_length=50)
    model: str = Field(min_length=1, max_length=100)
    year: int = Field(ge=1990, le=2100)
    fuel_type: FuelType
    engine_cc: int = Field(ge=0, le=10000, description="Use 0 for electric vehicles.")
    ex_showroom_price: Decimal = Field(gt=0, max_digits=12, decimal_places=2)


class VehicleOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    vehicle_id: int
    make: str
    model: str
    year: int
    fuel_type: FuelType
    engine_cc: int
    ex_showroom_price: Money


class AddonOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    addon_id: int
    addon_name: str
    price_rule: str
    applicability_note: str | None


class RateCardOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    rate_id: int
    insurer: str | None = None
    city_zone: str
    cc_band: str
    od_rate_pct: Percent
    tp_premium_flat: Money


class AddonPolicyOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    policy_id: int
    insurer: str
    addon_id: int
    addon_name: str | None = None
    price_rule: str
    applicability_note: str | None
    max_vehicle_age_months: int | None
    excluded_fuel_types: list[str] = Field(default_factory=list)
    recommend_only_in_flood_prone_city: bool
    min_claim_free_years: int
    recommendation_reason: str | None = None


# --------------------------------------------------------------------------- #
# Customers
# --------------------------------------------------------------------------- #

class CustomerCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    phone: str = Field(pattern=r"^(\+91[\s-]?)?[6-9]\d{9}$", description="Indian mobile number.")
    email: str | None = Field(default=None, pattern=r"^[^@\s]+@[^@\s]+\.[^@\s]+$", max_length=255)
    city: str = Field(min_length=1, max_length=80)
    gender: Gender | None = None
    date_of_birth: date | None = None
    address: str | None = Field(default=None, max_length=500)
    state: str | None = Field(default=None, max_length=80)
    pincode: str | None = Field(default=None, pattern=r"^[1-9]\d{5}$")
    lead_status: LeadStatus = "warm"
    preferred_vehicle_id: int | None = None
    registration_number: str | None = Field(default=None, max_length=20)
    policy_type: str | None = Field(default=None, max_length=40)
    notes: str | None = Field(default=None, max_length=2000)

    @model_validator(mode="before")
    @classmethod
    def _blank_to_none(cls, data: object) -> object:
        if isinstance(data, dict):
            return {k: (None if isinstance(v, str) and not v.strip() else v) for k, v in data.items()}
        return data


class CustomerOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    customer_id: int
    name: str
    phone: str
    email: str | None
    city: str
    gender: str | None = None
    date_of_birth: date | None = None
    address: str | None = None
    state: str | None = None
    pincode: str | None = None
    lead_status: str = "warm"
    preferred_vehicle_id: int | None = None
    preferred_vehicle_label: str | None = None
    registration_number: str | None = None
    policy_type: str | None = None
    notes: str | None = None
    created_at: datetime
    quote_count: int = 0
    converted_count: int = 0
    last_quote_at: datetime | None = None


class CustomerBrief(BaseModel):
    customer_id: int
    name: str
    phone: str
    email: str | None
    city: str


# --------------------------------------------------------------------------- #
# Quotes
# --------------------------------------------------------------------------- #

class VehiclePricingOverrides(BaseModel):
    """Optional quote-time edits. The vehicle_master row is still the catalog match;
    these values are used only for this calculation and are stored in the snapshot.
    """

    engine_cc: int | None = Field(default=None, ge=0, le=10000)
    ex_showroom_price: Decimal | None = Field(default=None, gt=0, max_digits=12, decimal_places=2)
    year: int | None = Field(default=None, ge=1990, le=2100)
    fuel_type: FuelType | None = None


class PlanComparisonRequest(VehiclePricingOverrides):
    vehicle_id: int
    city: str = Field(min_length=1, max_length=80)
    claim_free_years: int = Field(ge=0, le=50)
    registration_date: date | None = Field(
        default=None,
        description="Used for vehicle age. If omitted, 1 January of the model year is assumed.",
    )
    selected_addon_ids: list[int] | None = Field(
        default=None,
        description="Add-ons for the premium tier. When omitted, the rule-recommended add-ons are used.",
    )
    insurer: InsurerName = "HDFC ERGO"


class QuoteRequest(PlanComparisonRequest):
    """Create and save a quote for one plan tier.

    Provide either existing_customer_id or customer (new customer details).
    selected_addon_ids is only used for the premium tier; when omitted, the
    recommended add-ons for the vehicle are applied.
    """

    plan_tier: PlanTier = "premium"
    existing_customer_id: int | None = None
    customer: CustomerCreate | None = None

    @model_validator(mode="after")
    def _check_customer_and_addons(self) -> QuoteRequest:
        if (self.existing_customer_id is None) == (self.customer is None):
            raise ValueError("Provide exactly one of existing_customer_id or customer.")
        if self.selected_addon_ids and self.plan_tier != "premium":
            raise ValueError("selected_addon_ids can only be used with plan_tier 'premium'.")
        return self


class AddonLine(BaseModel):
    addon_id: int
    addon_name: str
    price_rule: str
    price: Money
    formula: str
    recommendation_reason: str | None = None


class QuoteBreakdown(BaseModel):
    """Mirrors calculator.calculate_full_quote output."""

    plan_tier: PlanTier | None
    insurer: str | None = None
    vehicle_id: int
    vehicle: str
    city: str | None
    city_zone: str
    cc_band: str
    vehicle_age_months: int
    age_basis: str
    ex_showroom_price: Money
    depreciation_pct: Percent | None
    idv: Money
    od_rate_pct: Percent
    od_premium: Money
    claim_free_years: int
    ncb_discount_pct: Percent
    ncb_discount_amount: Money
    net_od_premium: Money
    tp_premium: Money
    addon_breakdown: list[AddonLine]
    addons_total: Money
    total_premium: Money
    gst_pct: Percent | None = None
    gst_amount: Money | None = None
    total_payable: Money | None = None
    formula_trace: list[str]


class PlanComparison(BaseModel):
    basic: QuoteBreakdown
    standard: QuoteBreakdown
    premium: QuoteBreakdown


class InsurerCompareRequest(VehiclePricingOverrides):
    vehicle_id: int
    city: str = Field(min_length=1, max_length=80)
    claim_free_years: int = Field(default=0, ge=0, le=50)
    registration_date: date | None = None
    selected_addon_ids: list[int] | None = None


class MarketAddonPrice(BaseModel):
    insurer: str
    available: bool
    price: Money | None = None
    recommended: bool = False
    reason: str | None = None


class MarketAddonOption(BaseModel):
    addon_id: int
    addon_name: str
    available: bool
    recommended: bool
    recommended_by: list[str] = Field(default_factory=list)
    price_min: Money | None = None
    price_max: Money | None = None
    by_insurer: list[MarketAddonPrice]


class MarketAddonResponse(BaseModel):
    vehicle_id: int
    vehicle: str
    vehicle_age_months: int
    city: str
    flood_prone_city: bool
    depreciation_pct: Percent
    idv: Money
    claim_free_years: int = 0
    ncb_discount_pct: Percent | None = None
    options: list[MarketAddonOption]


class SkippedAddon(BaseModel):
    addon_id: int
    addon_name: str
    reason: str


class InsurerAddonNote(BaseModel):
    addon_id: int
    addon_name: str
    price: Money
    formula: str | None = None
    applicability_note: str | None = None
    recommended: bool = False
    recommendation_reason: str | None = None


class InsurerQuoteOffer(BaseModel):
    insurer: str
    basic: QuoteBreakdown
    standard: QuoteBreakdown
    premium: QuoteBreakdown
    applied_addon_ids: list[int]
    skipped_addons: list[SkippedAddon]
    addon_notes: list[InsurerAddonNote]
    is_lowest: bool = False
    suggestion: str


class InsurerComparison(BaseModel):
    city: str
    city_zone: str
    claim_free_years: int
    vehicle_id: int
    providers: list[InsurerQuoteOffer]


class PolicySectionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    section_id: int
    insurer: str
    section_number: str
    section_title: str
    parent_category: str
    related_addon: str | None = None
    content: str


class QuoteOut(BaseModel):
    quote_id: int
    display_id: str = Field(description="Human-friendly reference, e.g. QT-2026-0007.")
    customer_id: int
    vehicle_id: int
    plan_tier: PlanTier
    insurer: str = "HDFC ERGO"
    status: QuoteStatus
    effective_status: EffectiveStatus = Field(description="status, or 'expired' once a draft/sent quote passes valid_until.")
    claim_free_years: int
    city: str | None
    idv: Money
    od_premium: Money
    ncb_discount_amount: Money
    tp_premium: Money
    addons_selected: list[dict]
    total_premium: Money
    gst_amount: Money
    total_payable: Money
    created_at: datetime
    valid_until: datetime | None
    sent_at: datetime | None
    converted_at: datetime | None
    share_url: str | None
    customer: CustomerBrief
    vehicle: VehicleOut
    breakdown: QuoteBreakdown


class QuoteStatusUpdate(BaseModel):
    status: QuoteStatus


class ShareRequest(BaseModel):
    channel: Literal["whatsapp", "email", "link"] = "link"


class ShareOut(BaseModel):
    share_url: str
    wa_me_url: str = ""
    whatsapp_url: str
    email_url: str
    message: str
    quote: QuoteOut


class SendEmailOut(BaseModel):
    sent: bool
    email_from: str
    email_to: str
    share_url: str
    message: str
    quote: QuoteOut


# --------------------------------------------------------------------------- #
# Add-on options (deterministic, for the quote wizard)
# --------------------------------------------------------------------------- #

class AddonOptionsRequest(VehiclePricingOverrides):
    vehicle_id: int
    city: str = Field(min_length=1, max_length=80)
    registration_date: date | None = None
    claim_free_years: int = Field(default=0, ge=0, le=50)
    insurer: InsurerName = "HDFC ERGO"


class AddonOption(BaseModel):
    addon_id: int
    addon_name: str
    price_rule: str
    applicability_note: str | None
    available: bool
    price: Money | None
    formula: str | None
    unavailable_reason: str | None
    recommended: bool
    recommendation_reason: str | None


class AddonOptionsResponse(BaseModel):
    vehicle_id: int
    vehicle: str
    vehicle_age_months: int
    age_basis: str
    city: str
    flood_prone_city: bool
    depreciation_pct: Percent
    idv: Money
    claim_free_years: int = 0
    ncb_discount_pct: Percent | None = None
    insurer: str | None = None
    options: list[AddonOption]


# --------------------------------------------------------------------------- #
# Sales copilot (RAG over insurer policy documents)
# --------------------------------------------------------------------------- #

class AssistantRequest(BaseModel):
    question: str = Field(min_length=3, max_length=1000)
    companies: list[str] | None = Field(default=None, description="Limit retrieval to these insurers.")
    quote_id: int | None = Field(default=None, description="Ground the answer in this saved quote's figures.")
    n_results: int = Field(default=6, ge=1, le=15)


class AssistantSource(BaseModel):
    chunk_id: str
    company: str | None
    section_number: str | None
    section_title: str | None
    source_type: str | None
    similarity: float
    excerpt: str


class AssistantResponse(BaseModel):
    answer: str
    mode: Literal["policy_qa", "quote_pitch"]
    sources: list[AssistantSource]
    quote_display_id: str | None = None


# --------------------------------------------------------------------------- #
# AI add-on advisor
# --------------------------------------------------------------------------- #

class AdvisorRequest(VehiclePricingOverrides):
    vehicle_id: int
    city: str = Field(min_length=1, max_length=80)
    registration_date: date | None = None
    claim_free_years: int = Field(default=0, ge=0, le=50)
    insurer: InsurerName = "HDFC ERGO"


class AvailableAddonOut(BaseModel):
    addon_id: int
    addon_name: str
    price: Money
    formula: str
    applicability_note: str | None


class UnavailableAddonOut(BaseModel):
    addon_id: int
    addon_name: str
    reason: str


class AdvisorRecommendation(BaseModel):
    addon_id: int
    addon_name: str
    price: Money = Field(description="Always the rule-engine price, never the LLM's.")
    reasoning: str


class AdvisorNotRecommended(BaseModel):
    addon_id: int
    addon_name: str
    reasoning: str


class AdvisorResponse(BaseModel):
    vehicle_id: int
    vehicle: str
    fuel_type: str
    engine_cc: int
    vehicle_age_months: int
    age_basis: str
    city: str
    flood_prone_city: bool
    depreciation_pct: Percent
    idv: Money
    available_addons: list[AvailableAddonOut]
    unavailable_addons: list[UnavailableAddonOut]
    recommendations: list[AdvisorRecommendation]
    not_recommended: list[AdvisorNotRecommended]
    summary: str
    recommended_total: Money = Field(description="Sum of recommended add-on prices, computed by the rule engine.")
    source: Literal["ai", "rules_fallback"]
    model: str | None
    validation_notes: list[str]
