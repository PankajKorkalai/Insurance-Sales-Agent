"""Demo customers and quote history so the agent dashboard has realistic data.

Every quote is priced by the real calculator as of its (back-dated) creation
date. Runs once: if any demo customer (phones 98100000xx) already exists it does
nothing, unless --reset is given, which deletes the demo rows and recreates them.

    python src/seed_demo.py [--reset]
"""

from __future__ import annotations

import random
import sys
from datetime import date, datetime, time, timedelta, timezone

from sqlalchemy import delete, select

from calculator import apply_insurer, calculate_full_quote, city_zone_for, load_reference_data, recommended_addons, resolve_vehicle_age
from database import SessionLocal
from models import INSURERS, Customer, Quote, VehicleMaster
from schemas import QuoteBreakdown

IST = timezone(timedelta(hours=5, minutes=30))
DEMO_PHONE_PREFIX = "98100000"
VALIDITY = timedelta(days=30)

CUSTOMERS = [
    ("Rahul Sharma", "Mumbai", "Maharashtra", "male", "hot"),
    ("Priya Patel", "Ahmedabad", "Gujarat", "female", "warm"),
    ("Amit Verma", "Delhi", "Delhi", "male", "hot"),
    ("Sneha Iyer", "Chennai", "Tamil Nadu", "female", "warm"),
    ("Vikram Singh", "Jaipur", "Rajasthan", "male", "cold"),
    ("Ananya Reddy", "Hyderabad", "Telangana", "female", "hot"),
    ("Karan Mehta", "Pune", "Maharashtra", "male", "warm"),
    ("Neha Gupta", "Lucknow", "Uttar Pradesh", "female", "warm"),
    ("Arjun Nair", "Kochi", "Kerala", "male", "hot"),
    ("Pooja Desai", "Surat", "Gujarat", "female", "cold"),
    ("Rohit Kulkarni", "Bengaluru", "Karnataka", "male", "warm"),
    ("Meera Joshi", "Indore", "Madhya Pradesh", "female", "warm"),
    ("Sanjay Rao", "Nagpur", "Maharashtra", "male", "cold"),
    ("Divya Menon", "Kolkata", "West Bengal", "female", "hot"),
]


def _at(d: date, rng: random.Random) -> datetime:
    return datetime.combine(d, time(rng.randint(9, 19), rng.randint(0, 59)), IST).astimezone(timezone.utc)


def seed(reset: bool = False) -> tuple[int, int]:
    rng = random.Random(7)
    today = datetime.now(IST).date()
    with SessionLocal() as db:
        demo_ids = select(Customer.customer_id).where(Customer.phone.like(f"{DEMO_PHONE_PREFIX}%"))
        if db.scalars(demo_ids).first() is not None:
            if not reset:
                return 0, 0
            db.execute(delete(Quote).where(Quote.customer_id.in_(demo_ids)))
            db.execute(delete(Customer).where(Customer.phone.like(f"{DEMO_PHONE_PREFIX}%")))
            db.commit()

        ref = load_reference_data(db)
        vehicles = list(db.scalars(select(VehicleMaster).order_by(VehicleMaster.vehicle_id)))
        customers: list[Customer] = []
        for i, (name, city, state, gender, lead) in enumerate(CUSTOMERS):
            vehicle = rng.choice(vehicles)
            first, last = name.lower().split()
            customer = Customer(
                name=name, phone=f"{DEMO_PHONE_PREFIX}{i:02d}", email=f"{first}.{last}@example.com",
                city=city, state=state, gender=gender, lead_status=lead,
                preferred_vehicle_id=vehicle.vehicle_id, policy_type="Comprehensive",
                created_at=_at(today - timedelta(days=rng.randint(40, 80)), rng),
            )
            db.add(customer)
            customers.append(customer)
        db.flush()

        quotes = 0
        for n in range(42):
            customer = rng.choice(customers)
            vehicle = db.get(VehicleMaster, customer.preferred_vehicle_id) if rng.random() < 0.7 else rng.choice(vehicles)
            created_day = today - timedelta(days=min(int(rng.expovariate(1 / 18)), 75))
            created_at = max(_at(created_day, rng), customer.created_at + timedelta(hours=1))
            reg_date = date(vehicle.year, rng.randint(1, 12), rng.randint(1, 28))
            if reg_date > created_day:
                reg_date = date(vehicle.year, 1, 1)
            tier = rng.choices(["basic", "standard", "premium"], weights=[1, 3, 5])[0]
            claim_free = rng.choice([0, 0, 1, 2, 3, 5])
            insurer = rng.choice(INSURERS)
            age, _ = resolve_vehicle_age(vehicle, registration_date=reg_date, as_of=created_day)
            priced = apply_insurer(ref, insurer)
            picks = recommended_addons(priced.addons, age, vehicle.fuel_type, customer.city, claim_free)
            reasons = {a.addon_id: r for a, r in picks}
            addon_ids = []
            if tier == "premium":
                addon_ids = [i for i in reasons if rng.random() < 0.75] or list(reasons)[:2]
            try:
                b = calculate_full_quote(
                    vehicle, city_zone_for(customer.city), claim_free, addon_ids, db,
                    include_own_damage=tier != "basic", plan_tier=tier, city=customer.city,
                    registration_date=reg_date, as_of=created_day, reference=ref, addon_reasons=reasons,
                    insurer=insurer,
                )
            except ValueError:
                continue

            age_days = (today - created_day).days
            roll = rng.random()
            sent_at = converted_at = None
            status = "draft"
            if roll < 0.75:
                status, sent_at = "sent", created_at + timedelta(minutes=rng.randint(5, 240))
                if roll < 0.40 and age_days >= 1:
                    status = "converted"
                    converted_at = min(sent_at + timedelta(days=rng.randint(0, min(age_days, 6)), hours=rng.randint(1, 8)),
                                       datetime.now(timezone.utc))

            db.add(Quote(
                customer_id=customer.customer_id, vehicle_id=vehicle.vehicle_id,
                claim_free_years=b["claim_free_years"], city=customer.city,
                idv=b["idv"], od_premium=b["od_premium"], ncb_discount_amount=b["ncb_discount_amount"],
                tp_premium=b["tp_premium"],
                addons_selected=[{"addon_id": a["addon_id"], "addon_name": a["addon_name"], "price": str(a["price"])}
                                 for a in b["addon_breakdown"]],
                plan_tier=tier, insurer=insurer, total_premium=b["total_premium"], gst_amount=b["gst_amount"],
                total_payable=b["total_payable"], status=status,
                calculation_snapshot=QuoteBreakdown.model_validate(b).model_dump(mode="json"),
                created_at=created_at, valid_until=created_at + VALIDITY,
                sent_at=sent_at, converted_at=converted_at,
            ))
            quotes += 1
        db.commit()
        return len(customers), quotes


def main() -> int:
    customers, quotes = seed(reset="--reset" in sys.argv)
    if customers == 0:
        print("Demo data already present (use --reset to recreate).")
    else:
        print(f"Created {customers} demo customers and {quotes} demo quotes.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
