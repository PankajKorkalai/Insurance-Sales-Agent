"""insurer policy wording sections for complete quote documents

Revision ID: a1d8e4b27c90
Revises: 9f1b3c8a4d72
Create Date: 2026-09-28 14:15:00

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "a1d8e4b27c90"
down_revision: Union[str, Sequence[str], None] = "9f1b3c8a4d72"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "insurer_policy_sections",
        sa.Column("section_id", sa.Integer(), nullable=False),
        sa.Column("insurer", sa.String(length=40), nullable=False),
        sa.Column("section_number", sa.String(length=20), nullable=False),
        sa.Column("section_title", sa.String(length=200), nullable=False),
        sa.Column("parent_category", sa.String(length=40), nullable=False),
        sa.Column("related_addon", sa.String(length=50), nullable=True),
        sa.Column("content", sa.Text(), nullable=False),
        sa.CheckConstraint(
            "insurer IN ('HDFC ERGO', 'ICICI Lombard', 'Bajaj Allianz')",
            name="ck_insurer_policy_section_insurer",
        ),
        sa.PrimaryKeyConstraint("section_id"),
        sa.UniqueConstraint("insurer", "section_number", name="uq_insurer_policy_section"),
    )


def downgrade() -> None:
    op.drop_table("insurer_policy_sections")
