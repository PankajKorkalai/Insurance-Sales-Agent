"""Unit tests for the pure premium formulas. No database needed.

Run from the project root:  python -m unittest discover -s tests -v
"""

from __future__ import annotations

import sys
import unittest
from datetime import date
from decimal import Decimal
from pathlib import Path
from types import SimpleNamespace as NS

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "src"))

from calculator import (  # noqa: E402
    ReferenceData,
    calculate_addon_price,
    calculate_all_three_plans,
    calculate_full_quote,
    calculate_idv,
    calculate_ncb_discount,
    calculate_od_premium,
    cc_band_for,
    city_zone_for,
    compare_insurer_quotes,
    recommended_addons,
    round_money,
    vehicle_age_in_months,
)
from seed_data import ADDONS, ALL_RATE_CARDS, DEPRECIATION_SLABS, INSURER_ADDON_POLICIES, NCB_SLABS, RATE_CARD  # noqa: E402

D = Decimal

DEP = [NS(slab_id=i, **r) for i, r in enumerate(DEPRECIATION_SLABS, 1)]
NCB = [NS(slab_id=i, **r) for i, r in enumerate(NCB_SLABS, 1)]
RATES = [NS(rate_id=i, **r) for i, r in enumerate(RATE_CARD, 1)]
ADDON_ROWS = [NS(addon_id=i, **r) for i, r in enumerate(ADDONS, 1)]
REF = ReferenceData(depreciation_slabs=DEP, rate_cards=RATES, ncb_slabs=NCB, addons=ADDON_ROWS)
ADDON_ID = {a.addon_name: a.addon_id for a in ADDON_ROWS}
ALL_RATES = [NS(rate_id=i, **r) for i, r in enumerate(ALL_RATE_CARDS, 1)]
ALL_POLICIES = [
    NS(
        policy_id=i,
        insurer=raw["insurer"],
        addon_id=ADDON_ID[raw["addon_name"]],
        price_rule=raw["price_rule"],
        applicability_note=raw["applicability_note"],
        max_vehicle_age_months=raw["max_vehicle_age_months"],
        excluded_fuel_types=raw["excluded_fuel_types"],
        recommend_only_in_flood_prone_city=raw["recommend_only_in_flood_prone_city"],
        min_claim_free_years=raw["min_claim_free_years"],
        recommendation_reason=raw["recommendation_reason"],
    )
    for i, raw in enumerate(INSURER_ADDON_POLICIES, 1)
]
REF_ALL = ReferenceData(DEP, ALL_RATES, NCB, ADDON_ROWS, ALL_POLICIES)

CRETA = NS(vehicle_id=1, make="Hyundai", model="Creta SX", year=2026, fuel_type="petrol",
           engine_cc=1497, ex_showroom_price=D("1560000"))
NEXON_EV = NS(vehicle_id=2, make="Tata", model="Nexon EV", year=2025, fuel_type="electric",
              engine_cc=0, ex_showroom_price=D("1729000"))


class RoundingAndBands(unittest.TestCase):
    def test_round_half_up(self) -> None:
        self.assertEqual(round_money(D("10.005")), D("10.01"))
        self.assertEqual(round_money(D("10.004")), D("10.00"))
        self.assertEqual(round_money(0.1 + 0.2), D("0.30"))

    def test_cc_bands(self) -> None:
        self.assertEqual(cc_band_for(0), "below_1000")
        self.assertEqual(cc_band_for(999), "below_1000")
        self.assertEqual(cc_band_for(1000), "1000_1500")
        self.assertEqual(cc_band_for(1500), "1000_1500")
        self.assertEqual(cc_band_for(1501), "above_1500")

    def test_city_zones(self) -> None:
        self.assertEqual(city_zone_for("Mumbai"), "zone_a_mumbai_delhi")
        self.assertEqual(city_zone_for(" jaipur "), "zone_b_tier2")
        self.assertEqual(city_zone_for("Shimla"), "zone_c_other")

    def test_vehicle_age_counts_completed_months(self) -> None:
        self.assertEqual(vehicle_age_in_months(date(2026, 1, 15), date(2026, 7, 14)), 5)
        self.assertEqual(vehicle_age_in_months(date(2026, 1, 15), date(2026, 7, 15)), 6)
        with self.assertRaises(ValueError):
            vehicle_age_in_months(date(2026, 10, 1), date(2026, 9, 1))


class CoreFormulas(unittest.TestCase):
    def test_idv_slab_boundaries(self) -> None:
        price = D("1000000")
        self.assertEqual(calculate_idv(price, 0, DEP), D("950000.00"))
        self.assertEqual(calculate_idv(price, 6, DEP), D("950000.00"))
        self.assertEqual(calculate_idv(price, 7, DEP), D("850000.00"))
        self.assertEqual(calculate_idv(price, 24, DEP), D("800000.00"))
        self.assertEqual(calculate_idv(price, 60, DEP), D("500000.00"))

    def test_idv_too_old_raises(self) -> None:
        with self.assertRaises(ValueError):
            calculate_idv(D("1000000"), 61, DEP)

    def test_od_premium(self) -> None:
        row = NS(od_rate_pct=D("3.283"))
        self.assertEqual(calculate_od_premium(D("1326000.00"), row), D("43532.58"))

    def test_ncb(self) -> None:
        self.assertEqual(calculate_ncb_discount(D("10000"), 0, NCB), D("0.00"))
        self.assertEqual(calculate_ncb_discount(D("10000"), 1, NCB), D("2000.00"))
        self.assertEqual(calculate_ncb_discount(D("10000"), 5, NCB), D("5000.00"))
        self.assertEqual(calculate_ncb_discount(D("10000"), 9, NCB), D("5000.00"))

    def test_addon_price_rules(self) -> None:
        self.assertEqual(calculate_addon_price(NS(addon_name="x", price_rule="flat_4200"), D("1")), D("4200.00"))
        self.assertEqual(
            calculate_addon_price(NS(addon_name="x", price_rule="pct_of_idv_2"), D("500000")), D("10000.00")
        )
        self.assertEqual(
            calculate_addon_price(NS(addon_name="x", price_rule="pct_of_idv_0.45"), D("1326000")), D("5967.00")
        )
        with self.assertRaises(ValueError):
            calculate_addon_price(NS(addon_name="x", price_rule="five_percent"), D("1"))


class FullQuote(unittest.TestCase):
    AS_OF = date(2026, 9, 28)

    def test_creta_mumbai_premium_hand_computed(self) -> None:
        # Age: 2026-01-01 -> 2026-09-28 = 8 months -> 15% depreciation
        # IDV = 1,560,000 x 0.85                = 1,326,000.00
        # OD  = 1,326,000 x 3.283%              =    43,532.58
        # NCB = 43,532.58 x 35% = 15,236.403    ->   15,236.40
        # Net OD                                =    28,296.18
        # TP  (1000-1500 cc)                    =     3,416.00
        # Add-ons: 5,967 + 249 + 1,989 + 1,326 + 3,978 + 499 = 14,008.00
        # Total                                 =    45,720.18
        # GST = 45,720.18 x 18% = 8,229.6324    ->    8,229.63
        # Payable                               =    53,949.81
        quote = calculate_all_three_plans(
            CRETA, "zone_a_mumbai_delhi", 3, None, city="Mumbai", as_of=self.AS_OF, reference=REF,
        )["premium"]
        self.assertEqual(
            [a["addon_name"] for a in quote["addon_breakdown"]],
            ["zero_depreciation", "roadside_assistance", "engine_protection",
             "consumables_cover", "return_to_invoice", "key_replacement"],
        )
        self.assertEqual(quote["vehicle_age_months"], 8)
        self.assertEqual(quote["idv"], D("1326000.00"))
        self.assertEqual(quote["od_premium"], D("43532.58"))
        self.assertEqual(quote["ncb_discount_amount"], D("15236.40"))
        self.assertEqual(quote["net_od_premium"], D("28296.18"))
        self.assertEqual(quote["tp_premium"], D("3416.00"))
        self.assertEqual(quote["addons_total"], D("14008.00"))
        self.assertEqual(quote["total_premium"], D("45720.18"))
        self.assertEqual(
            quote["total_premium"],
            quote["od_premium"] - quote["ncb_discount_amount"] + quote["tp_premium"] + quote["addons_total"],
        )
        self.assertEqual(quote["gst_amount"], D("8229.63"))
        self.assertEqual(quote["total_payable"], D("53949.81"))

    def test_premium_plan_with_custom_addons(self) -> None:
        plans = calculate_all_three_plans(
            CRETA, "zone_a_mumbai_delhi", 3, None, city="Mumbai", as_of=self.AS_OF, reference=REF,
            premium_addon_ids=[ADDON_ID["roadside_assistance"], ADDON_ID["key_replacement"]],
        )
        self.assertEqual(
            [a["addon_name"] for a in plans["premium"]["addon_breakdown"]],
            ["roadside_assistance", "key_replacement"],
        )
        self.assertEqual(plans["premium"]["addons_total"], D("748.00"))
        self.assertEqual(plans["standard"]["addon_breakdown"], [])

    def test_claim_free_years_change_recommended_addons(self) -> None:
        names = lambda years: [
            a.addon_name
            for a, _ in recommended_addons(ADDON_ROWS, 8, "petrol", "Mumbai", years)
        ]
        self.assertEqual(
            names(0),
            ["zero_depreciation", "roadside_assistance", "engine_protection", "key_replacement"],
        )
        self.assertEqual(
            names(1),
            ["zero_depreciation", "roadside_assistance", "engine_protection",
             "consumables_cover", "key_replacement"],
        )
        self.assertEqual(
            names(2),
            ["zero_depreciation", "roadside_assistance", "engine_protection",
             "consumables_cover", "return_to_invoice", "key_replacement"],
        )
        premium0 = calculate_all_three_plans(
            CRETA, "zone_a_mumbai_delhi", 0, None, city="Mumbai", as_of=self.AS_OF, reference=REF,
        )["premium"]
        self.assertEqual(
            [a["addon_name"] for a in premium0["addon_breakdown"]],
            names(0),
        )

    def test_three_plans_non_flood_city_and_ev(self) -> None:
        plans = calculate_all_three_plans(
            NEXON_EV, "zone_b_tier2", 0, None, city="Jaipur", as_of=self.AS_OF, reference=REF,
        )
        self.assertEqual(plans["basic"]["total_premium"], D("2094.00"))
        self.assertEqual(plans["standard"]["addon_breakdown"], [])
        self.assertLess(plans["standard"]["total_premium"], plans["premium"]["total_premium"])
        names = {a["addon_name"] for a in plans["premium"]["addon_breakdown"]}
        self.assertNotIn("engine_protection", names)
        self.assertIn("zero_depreciation", names)

    def test_basic_plan_is_tp_only(self) -> None:
        quote = calculate_full_quote(
            CRETA, "zone_c_other", 2, [], None,
            include_own_damage=False, as_of=self.AS_OF, reference=REF,
        )
        self.assertEqual(quote["idv"], D("0.00"))
        self.assertEqual(quote["od_premium"], D("0.00"))
        self.assertEqual(quote["total_premium"], D("3416.00"))

    def test_basic_plan_rejects_addons(self) -> None:
        with self.assertRaises(ValueError):
            calculate_full_quote(
                CRETA, "zone_c_other", 0, [ADDON_ID["roadside_assistance"]], None,
                include_own_damage=False, as_of=self.AS_OF, reference=REF,
            )

    def test_missing_rate_card_row_raises(self) -> None:
        ref = ReferenceData(DEP, [r for r in RATES if r.cc_band != "1000_1500"], NCB, ADDON_ROWS)
        with self.assertRaisesRegex(ValueError, "No rate_card row"):
            calculate_full_quote(CRETA, "zone_a_mumbai_delhi", 0, [], None, as_of=self.AS_OF, reference=ref)

    def test_return_to_invoice_age_limit(self) -> None:
        with self.assertRaisesRegex(ValueError, "return_to_invoice"):
            calculate_full_quote(
                CRETA, "zone_a_mumbai_delhi", 0, [ADDON_ID["return_to_invoice"]], None,
                vehicle_age_months=40, reference=REF,
            )

    def test_engine_protection_not_for_ev(self) -> None:
        with self.assertRaisesRegex(ValueError, "electric"):
            calculate_full_quote(
                NEXON_EV, "zone_a_mumbai_delhi", 0, [ADDON_ID["engine_protection"]], None,
                as_of=self.AS_OF, reference=REF,
            )

    def test_insurers_use_different_od_rates_and_addon_prices(self) -> None:
        kwargs = dict(
            city="Mumbai", as_of=self.AS_OF, reference=REF_ALL,
            premium_addon_ids=[ADDON_ID["roadside_assistance"], ADDON_ID["key_replacement"]],
        )
        hdfc = calculate_all_three_plans(
            CRETA, "zone_a_mumbai_delhi", 3, None, insurer="HDFC ERGO", **kwargs,
        )["premium"]
        icici = calculate_all_three_plans(
            CRETA, "zone_a_mumbai_delhi", 3, None, insurer="ICICI Lombard", **kwargs,
        )["premium"]
        bajaj = calculate_all_three_plans(
            CRETA, "zone_a_mumbai_delhi", 3, None, insurer="Bajaj Allianz", **kwargs,
        )["premium"]
        self.assertEqual(hdfc["od_rate_pct"], D("3.283"))
        self.assertEqual(icici["od_rate_pct"], D("3.480"))
        self.assertEqual(bajaj["od_rate_pct"], D("3.152"))
        self.assertNotEqual(hdfc["total_payable"], icici["total_payable"])
        self.assertNotEqual(hdfc["total_payable"], bajaj["total_payable"])
        rsa = {
            "HDFC ERGO": next(a["price"] for a in hdfc["addon_breakdown"] if a["addon_name"] == "roadside_assistance"),
            "ICICI Lombard": next(a["price"] for a in icici["addon_breakdown"] if a["addon_name"] == "roadside_assistance"),
            "Bajaj Allianz": next(a["price"] for a in bajaj["addon_breakdown"] if a["addon_name"] == "roadside_assistance"),
        }
        self.assertEqual(rsa["HDFC ERGO"], D("249.00"))
        self.assertEqual(rsa["ICICI Lombard"], D("349.00"))
        self.assertEqual(rsa["Bajaj Allianz"], D("199.00"))

    def test_insurer_addon_age_limits_differ(self) -> None:
        # Bajaj Engine Protector stops at 36 months; ICICI allows up to 84.
        with self.assertRaisesRegex(ValueError, "engine_protection"):
            calculate_full_quote(
                CRETA, "zone_a_mumbai_delhi", 3, [ADDON_ID["engine_protection"]], None,
                city="Mumbai", vehicle_age_months=48, reference=REF_ALL, insurer="Bajaj Allianz",
            )
        icici = calculate_full_quote(
            CRETA, "zone_a_mumbai_delhi", 3, [ADDON_ID["engine_protection"]], None,
            city="Mumbai", vehicle_age_months=48, reference=REF_ALL, insurer="ICICI Lombard",
        )
        self.assertEqual(icici["addon_breakdown"][0]["addon_name"], "engine_protection")

    def test_compare_insurers_returns_three_premiums(self) -> None:
        result = compare_insurer_quotes(
            CRETA, "Mumbai", 3,
            [ADDON_ID["roadside_assistance"], ADDON_ID["key_replacement"]],
            None, as_of=self.AS_OF, reference=REF_ALL,
        )
        names = [p["insurer"] for p in result["providers"]]
        self.assertEqual(names, ["HDFC ERGO", "ICICI Lombard", "Bajaj Allianz"])
        payables = [p["premium"]["total_payable"] for p in result["providers"]]
        self.assertEqual(len(set(payables)), 3)
        self.assertEqual(sum(1 for p in result["providers"] if p["is_lowest"]), 1)
        rsa = {
            p["insurer"]: next(a["price"] for a in p["premium"]["addon_breakdown"] if a["addon_name"] == "roadside_assistance")
            for p in result["providers"]
        }
        self.assertEqual(rsa["HDFC ERGO"], D("249.00"))
        self.assertEqual(rsa["ICICI Lombard"], D("349.00"))
        self.assertEqual(rsa["Bajaj Allianz"], D("199.00"))

    def test_unknown_zone_raises(self) -> None:
        with self.assertRaises(ValueError):
            calculate_full_quote(CRETA, "zone_x", 0, [], None, as_of=self.AS_OF, reference=REF)


if __name__ == "__main__":
    unittest.main()
