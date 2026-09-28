"""per-insurer rate cards and add-on policies

Revision ID: 9f1b3c8a4d72
Revises: 8c4a2e91f0b3
Create Date: 2026-09-28 13:55:00

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "9f1b3c8a4d72"
down_revision: Union[str, Sequence[str], None] = "8c4a2e91f0b3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "rate_card",
        sa.Column("insurer", sa.String(length=40), server_default="HDFC ERGO", nullable=False),
    )
    op.drop_constraint("uq_rate_card_zone_band", "rate_card", type_="unique")
    op.create_unique_constraint(
        "uq_rate_card_insurer_zone_band", "rate_card", ["insurer", "city_zone", "cc_band"]
    )
    op.create_check_constraint(
        "ck_rate_card_insurer",
        "rate_card",
        "insurer IN ('HDFC ERGO', 'ICICI Lombard', 'Bajaj Allianz')",
    )

    op.create_table(
        "insurer_addon_policies",
        sa.Column("policy_id", sa.Integer(), nullable=False),
        sa.Column("insurer", sa.String(length=40), nullable=False),
        sa.Column("addon_id", sa.Integer(), nullable=False),
        sa.Column("price_rule", sa.String(length=50), nullable=False),
        sa.Column("applicability_note", sa.Text(), nullable=True),
        sa.Column("max_vehicle_age_months", sa.Integer(), nullable=True),
        sa.Column(
            "excluded_fuel_types",
            postgresql.JSONB(astext_type=sa.Text()),
            server_default="[]",
            nullable=False,
        ),
        sa.Column(
            "recommend_only_in_flood_prone_city",
            sa.Boolean(),
            server_default="false",
            nullable=False,
        ),
        sa.Column("min_claim_free_years", sa.Integer(), server_default="0", nullable=False),
        sa.Column("recommendation_reason", sa.Text(), nullable=True),
        sa.CheckConstraint(
            "insurer IN ('HDFC ERGO', 'ICICI Lombard', 'Bajaj Allianz')",
            name="ck_insurer_addon_policy_insurer",
        ),
        sa.CheckConstraint("min_claim_free_years >= 0", name="ck_insurer_addon_min_cfy"),
        sa.ForeignKeyConstraint(["addon_id"], ["addons.addon_id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("policy_id"),
        sa.UniqueConstraint("insurer", "addon_id", name="uq_insurer_addon_policy"),
    )


def downgrade() -> None:
    op.drop_table("insurer_addon_policies")
    op.drop_constraint("ck_rate_card_insurer", "rate_card", type_="check")
    op.drop_constraint("uq_rate_card_insurer_zone_band", "rate_card", type_="unique")
    op.drop_column("rate_card", "insurer")
    op.create_unique_constraint("uq_rate_card_zone_band", "rate_card", ["city_zone", "cc_band"])
