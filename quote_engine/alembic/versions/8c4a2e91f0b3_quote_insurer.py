"""quote insurer and NCB-aware add-on suggestions

Revision ID: 8c4a2e91f0b3
Revises: 5b1e9c2d7a41
Create Date: 2026-09-28 13:45:00

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "8c4a2e91f0b3"
down_revision: Union[str, Sequence[str], None] = "5b1e9c2d7a41"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "quotes",
        sa.Column("insurer", sa.String(length=40), server_default="HDFC ERGO", nullable=False),
    )
    op.create_check_constraint(
        "ck_quotes_insurer",
        "quotes",
        "insurer IN ('HDFC ERGO', 'ICICI Lombard', 'Bajaj Allianz')",
    )


def downgrade() -> None:
    op.drop_constraint("ck_quotes_insurer", "quotes", type_="check")
    op.drop_column("quotes", "insurer")
