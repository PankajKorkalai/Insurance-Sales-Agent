"""SQLAlchemy ORM models for the Motor Insurance Quote Engine."""

from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from typing import Any

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship

FUEL_TYPES: tuple[str, ...] = ("petrol", "diesel", "electric", "cng")
PLAN_TIERS: tuple[str, ...] = ("basic", "standard", "premium")
QUOTE_STATUSES: tuple[str, ...] = ("draft", "sent", "converted")
LEAD_STATUSES: tuple[str, ...] = ("hot", "warm", "cold")
GENDERS: tuple[str, ...] = ("male", "female", "other")
INSURERS: tuple[str, ...] = ("HDFC ERGO", "ICICI Lombard", "Bajaj Allianz")


def _in_list(column: str, values: tuple[str, ...]) -> str:
    return f"{column} IN ({', '.join(repr(v) for v in values)})"


class Base(DeclarativeBase):
    pass


class VehicleMaster(Base):
    __tablename__ = "vehicle_master"
    __table_args__ = (
        UniqueConstraint("make", "model", "year", "fuel_type", name="uq_vehicle_make_model_year_fuel"),
        CheckConstraint(_in_list("fuel_type", FUEL_TYPES), name="ck_vehicle_fuel_type"),
        CheckConstraint("engine_cc >= 0", name="ck_vehicle_engine_cc"),
        CheckConstraint("ex_showroom_price > 0", name="ck_vehicle_price"),
    )

    vehicle_id: Mapped[int] = mapped_column(Integer, primary_key=True)
    make: Mapped[str] = mapped_column(String(50), nullable=False)
    model: Mapped[str] = mapped_column(String(100), nullable=False)
    year: Mapped[int] = mapped_column(Integer, nullable=False)
    fuel_type: Mapped[str] = mapped_column(String(20), nullable=False)
    engine_cc: Mapped[int] = mapped_column(Integer, nullable=False)
    ex_showroom_price: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)

    quotes: Mapped[list[Quote]] = relationship(back_populates="vehicle")


class DepreciationSlab(Base):
    """Age bands are inclusive on both ends, in completed months (0-6, 7-12, ...)."""

    __tablename__ = "depreciation_slabs"
    __table_args__ = (
        UniqueConstraint("age_min_months", "age_max_months", name="uq_depreciation_age_band"),
        CheckConstraint("age_min_months <= age_max_months", name="ck_depreciation_band_order"),
    )

    slab_id: Mapped[int] = mapped_column(Integer, primary_key=True)
    age_min_months: Mapped[int] = mapped_column(Integer, nullable=False)
    age_max_months: Mapped[int] = mapped_column(Integer, nullable=False)
    depreciation_pct: Mapped[Decimal] = mapped_column(Numeric(5, 2), nullable=False)


class RateCard(Base):
    __tablename__ = "rate_card"
    __table_args__ = (
        UniqueConstraint("insurer", "city_zone", "cc_band", name="uq_rate_card_insurer_zone_band"),
        CheckConstraint(_in_list("insurer", INSURERS), name="ck_rate_card_insurer"),
    )

    rate_id: Mapped[int] = mapped_column(Integer, primary_key=True)
    insurer: Mapped[str] = mapped_column(String(40), nullable=False, server_default="HDFC ERGO")
    city_zone: Mapped[str] = mapped_column(String(50), nullable=False)
    cc_band: Mapped[str] = mapped_column(String(20), nullable=False)
    od_rate_pct: Mapped[Decimal] = mapped_column(Numeric(6, 3), nullable=False)
    tp_premium_flat: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)


class NcbSlab(Base):
    __tablename__ = "ncb_slabs"

    slab_id: Mapped[int] = mapped_column(Integer, primary_key=True)
    claim_free_years: Mapped[int] = mapped_column(Integer, nullable=False, unique=True)
    ncb_discount_pct: Mapped[Decimal] = mapped_column(Numeric(5, 2), nullable=False)


class Addon(Base):
    __tablename__ = "addons"

    addon_id: Mapped[int] = mapped_column(Integer, primary_key=True)
    addon_name: Mapped[str] = mapped_column(String(50), nullable=False, unique=True)
    price_rule: Mapped[str] = mapped_column(String(50), nullable=False)
    applicability_note: Mapped[str | None] = mapped_column(Text)


class InsurerAddonPolicy(Base):
    """Per-insurer add-on price and eligibility, taken from that insurer's policy wording."""

    __tablename__ = "insurer_addon_policies"
    __table_args__ = (
        UniqueConstraint("insurer", "addon_id", name="uq_insurer_addon_policy"),
        CheckConstraint(_in_list("insurer", INSURERS), name="ck_insurer_addon_policy_insurer"),
        CheckConstraint("min_claim_free_years >= 0", name="ck_insurer_addon_min_cfy"),
    )

    policy_id: Mapped[int] = mapped_column(Integer, primary_key=True)
    insurer: Mapped[str] = mapped_column(String(40), nullable=False)
    addon_id: Mapped[int] = mapped_column(
        ForeignKey("addons.addon_id", ondelete="CASCADE"), nullable=False
    )
    price_rule: Mapped[str] = mapped_column(String(50), nullable=False)
    applicability_note: Mapped[str | None] = mapped_column(Text)
    max_vehicle_age_months: Mapped[int | None] = mapped_column(Integer)
    excluded_fuel_types: Mapped[list[str]] = mapped_column(JSONB, nullable=False, server_default="[]")
    recommend_only_in_flood_prone_city: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default="false"
    )
    min_claim_free_years: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    recommendation_reason: Mapped[str | None] = mapped_column(Text)

    addon: Mapped[Addon] = relationship()


class InsurerPolicySection(Base):
    """Policy wording sections per insurer (IDV, cover, exclusions, NCB, claims, add-ons)."""

    __tablename__ = "insurer_policy_sections"
    __table_args__ = (
        UniqueConstraint("insurer", "section_number", name="uq_insurer_policy_section"),
        CheckConstraint(_in_list("insurer", INSURERS), name="ck_insurer_policy_section_insurer"),
    )

    section_id: Mapped[int] = mapped_column(Integer, primary_key=True)
    insurer: Mapped[str] = mapped_column(String(40), nullable=False)
    section_number: Mapped[str] = mapped_column(String(20), nullable=False)
    section_title: Mapped[str] = mapped_column(String(200), nullable=False)
    parent_category: Mapped[str] = mapped_column(String(40), nullable=False)
    related_addon: Mapped[str | None] = mapped_column(String(50))
    content: Mapped[str] = mapped_column(Text, nullable=False)


class Customer(Base):
    __tablename__ = "customers"
    __table_args__ = (
        CheckConstraint(_in_list("lead_status", LEAD_STATUSES), name="ck_customers_lead_status"),
        CheckConstraint(f"gender IS NULL OR {_in_list('gender', GENDERS)}", name="ck_customers_gender"),
    )

    customer_id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    phone: Mapped[str] = mapped_column(String(20), nullable=False, index=True)
    email: Mapped[str | None] = mapped_column(String(255))
    city: Mapped[str] = mapped_column(String(80), nullable=False)
    gender: Mapped[str | None] = mapped_column(String(10))
    date_of_birth: Mapped[date | None] = mapped_column(Date)
    address: Mapped[str | None] = mapped_column(Text)
    state: Mapped[str | None] = mapped_column(String(80))
    pincode: Mapped[str | None] = mapped_column(String(10))
    lead_status: Mapped[str] = mapped_column(String(10), nullable=False, server_default="warm")
    preferred_vehicle_id: Mapped[int | None] = mapped_column(
        ForeignKey("vehicle_master.vehicle_id", ondelete="SET NULL")
    )
    registration_number: Mapped[str | None] = mapped_column(String(20))
    policy_type: Mapped[str | None] = mapped_column(String(40))
    notes: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    quotes: Mapped[list[Quote]] = relationship(back_populates="customer")
    preferred_vehicle: Mapped[VehicleMaster | None] = relationship()


class Quote(Base):
    __tablename__ = "quotes"
    __table_args__ = (
        Index("ix_quotes_customer_id", "customer_id"),
        Index("ix_quotes_vehicle_id", "vehicle_id"),
        Index("ix_quotes_status", "status"),
        CheckConstraint(_in_list("plan_tier", PLAN_TIERS), name="ck_quotes_plan_tier"),
        CheckConstraint(_in_list("status", QUOTE_STATUSES), name="ck_quotes_status"),
        CheckConstraint(_in_list("insurer", INSURERS), name="ck_quotes_insurer"),
        CheckConstraint("claim_free_years >= 0", name="ck_quotes_claim_free_years"),
    )

    quote_id: Mapped[int] = mapped_column(Integer, primary_key=True)
    customer_id: Mapped[int] = mapped_column(
        ForeignKey("customers.customer_id", ondelete="RESTRICT"), nullable=False
    )
    vehicle_id: Mapped[int] = mapped_column(
        ForeignKey("vehicle_master.vehicle_id", ondelete="RESTRICT"), nullable=False
    )
    claim_free_years: Mapped[int] = mapped_column(Integer, nullable=False)
    idv: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    od_premium: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    ncb_discount_amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    tp_premium: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    addons_selected: Mapped[list[dict[str, Any]]] = mapped_column(
        JSONB, nullable=False, server_default="[]"
    )
    plan_tier: Mapped[str] = mapped_column(String(20), nullable=False)
    insurer: Mapped[str] = mapped_column(String(40), nullable=False, server_default="HDFC ERGO")
    city: Mapped[str | None] = mapped_column(String(80))
    total_premium: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    gst_amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False, server_default="0")
    total_payable: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False, server_default="0")
    status: Mapped[str] = mapped_column(String(20), nullable=False, server_default="draft")
    # Full itemised breakdown (inputs, rates, formulas) frozen at quote time, so the
    # quote stays reproducible even after rate cards or slabs change.
    calculation_snapshot: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    # Draft/sent quotes past valid_until are reported as "expired" (derived, not stored).
    valid_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    converted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    share_token: Mapped[str | None] = mapped_column(String(64), unique=True)

    customer: Mapped[Customer] = relationship(back_populates="quotes")
    vehicle: Mapped[VehicleMaster] = relationship(back_populates="quotes")
