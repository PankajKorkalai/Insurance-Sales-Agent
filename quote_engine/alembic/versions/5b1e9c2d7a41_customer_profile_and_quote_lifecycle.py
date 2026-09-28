"""customer profile fields and quote lifecycle (GST, expiry, sharing)

Revision ID: 5b1e9c2d7a41
Revises: 27cc3f480820
Create Date: 2026-09-28 18:00:00

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = '5b1e9c2d7a41'
down_revision: Union[str, Sequence[str], None] = '27cc3f480820'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('customers', sa.Column('gender', sa.String(length=10), nullable=True))
    op.add_column('customers', sa.Column('date_of_birth', sa.Date(), nullable=True))
    op.add_column('customers', sa.Column('address', sa.Text(), nullable=True))
    op.add_column('customers', sa.Column('state', sa.String(length=80), nullable=True))
    op.add_column('customers', sa.Column('pincode', sa.String(length=10), nullable=True))
    op.add_column('customers', sa.Column('lead_status', sa.String(length=10), server_default='warm', nullable=False))
    op.add_column('customers', sa.Column('preferred_vehicle_id', sa.Integer(), nullable=True))
    op.add_column('customers', sa.Column('registration_number', sa.String(length=20), nullable=True))
    op.add_column('customers', sa.Column('policy_type', sa.String(length=40), nullable=True))
    op.add_column('customers', sa.Column('notes', sa.Text(), nullable=True))
    op.create_foreign_key(
        'fk_customers_preferred_vehicle', 'customers', 'vehicle_master',
        ['preferred_vehicle_id'], ['vehicle_id'], ondelete='SET NULL',
    )
    op.create_check_constraint('ck_customers_lead_status', 'customers', "lead_status IN ('hot', 'warm', 'cold')")
    op.create_check_constraint(
        'ck_customers_gender', 'customers', "gender IS NULL OR gender IN ('male', 'female', 'other')"
    )

    op.add_column('quotes', sa.Column('city', sa.String(length=80), nullable=True))
    op.add_column('quotes', sa.Column('gst_amount', sa.Numeric(precision=12, scale=2), server_default='0', nullable=False))
    op.add_column('quotes', sa.Column('total_payable', sa.Numeric(precision=12, scale=2), server_default='0', nullable=False))
    op.add_column('quotes', sa.Column('valid_until', sa.DateTime(timezone=True), nullable=True))
    op.add_column('quotes', sa.Column('sent_at', sa.DateTime(timezone=True), nullable=True))
    op.add_column('quotes', sa.Column('converted_at', sa.DateTime(timezone=True), nullable=True))
    op.add_column('quotes', sa.Column('share_token', sa.String(length=64), nullable=True))
    op.create_unique_constraint('uq_quotes_share_token', 'quotes', ['share_token'])

    # Backfill quotes saved before this revision: 18% GST, 30-day validity, city from the snapshot.
    op.execute("""
        UPDATE quotes SET
            city = calculation_snapshot->>'city',
            gst_amount = ROUND(total_premium * 0.18, 2),
            total_payable = total_premium + ROUND(total_premium * 0.18, 2),
            valid_until = created_at + INTERVAL '30 days',
            converted_at = CASE WHEN status = 'converted' THEN created_at END,
            sent_at = CASE WHEN status IN ('sent', 'converted') THEN created_at END
    """)


def downgrade() -> None:
    op.drop_constraint('uq_quotes_share_token', 'quotes', type_='unique')
    for column in ('share_token', 'converted_at', 'sent_at', 'valid_until', 'total_payable', 'gst_amount', 'city'):
        op.drop_column('quotes', column)

    op.drop_constraint('ck_customers_gender', 'customers', type_='check')
    op.drop_constraint('ck_customers_lead_status', 'customers', type_='check')
    op.drop_constraint('fk_customers_preferred_vehicle', 'customers', type_='foreignkey')
    for column in ('notes', 'policy_type', 'registration_number', 'preferred_vehicle_id', 'pincode',
                   'state', 'address', 'lead_status', 'date_of_birth', 'gender'):
        op.drop_column('customers', column)
