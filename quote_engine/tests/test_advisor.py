"""Tests for AI add-on advisor validation and fallback. No database or LLM calls.

Run from the project root:  python -m unittest discover -s tests -v
"""

from __future__ import annotations

import json
import sys
import unittest
from datetime import date
from decimal import Decimal
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "src"))

from advisor import AvailableAddon, InvalidAdvice, get_addon_advice, validate_advice  # noqa: E402
from test_calculator import CRETA, REF  # noqa: E402

D = Decimal
AVAILABLE = [
    AvailableAddon(1, "zero_depreciation", D("4200.00"), "flat 4,200.00", None),
    AvailableAddon(3, "engine_protection", D("1800.00"), "flat 1,800.00", None),
]


def advice(recs: list[dict], not_recs: list[dict] | None = None, summary: str = "Good cover.") -> dict:
    return {"recommendations": recs, "not_recommended": not_recs or [], "summary": summary}


class ValidateAdvice(unittest.TestCase):
    def test_valid_advice_uses_db_prices(self) -> None:
        result = validate_advice(advice(
            [{"name": "zero_depreciation", "price": 4200, "reasoning": "New car; costs ₹4,200."}],
            [{"name": "engine_protection", "reasoning": "Optional."}],
        ), AVAILABLE)
        self.assertEqual(result["recommendations"][0]["price"], D("4200.00"))
        self.assertEqual(result["recommendations"][0]["addon_id"], 1)

    def test_invented_addon_rejected(self) -> None:
        with self.assertRaisesRegex(InvalidAdvice, "tyre_protection"):
            validate_advice(advice(
                [{"name": "tyre_protection", "price": 999, "reasoning": "x"}],
                [{"name": "zero_depreciation", "reasoning": "x"}, {"name": "engine_protection", "reasoning": "x"}],
            ), AVAILABLE)

    def test_wrong_price_rejected(self) -> None:
        with self.assertRaisesRegex(InvalidAdvice, "listed price is 4200.00"):
            validate_advice(advice(
                [{"name": "zero_depreciation", "price": 3999, "reasoning": "x"}],
                [{"name": "engine_protection", "reasoning": "x"}],
            ), AVAILABLE)

    def test_foreign_amount_in_text_rejected(self) -> None:
        with self.assertRaisesRegex(InvalidAdvice, "Rs 50,000"):
            validate_advice(advice(
                [{"name": "zero_depreciation", "price": "4,200", "reasoning": "Saves up to Rs 50,000 on claims."}],
                [{"name": "engine_protection", "reasoning": "x"}],
            ), AVAILABLE)

    def test_amount_in_summary_rejected(self) -> None:
        with self.assertRaises(InvalidAdvice):
            validate_advice(advice(
                [{"name": "zero_depreciation", "price": 4200, "reasoning": "x"}],
                [{"name": "engine_protection", "reasoning": "x"}],
                summary="Total ₹4,200.",
            ), AVAILABLE)

    def test_missing_and_duplicate_rejected(self) -> None:
        with self.assertRaises(InvalidAdvice) as ctx:
            validate_advice(advice([
                {"name": "zero_depreciation", "price": 4200, "reasoning": "x"},
                {"name": "zero_depreciation", "price": 4200, "reasoning": "x"},
            ]), AVAILABLE)
        joined = " ".join(ctx.exception.errors)
        self.assertIn("more than once", joined)
        self.assertIn("engine_protection", joined)


class AdviceOrchestration(unittest.TestCase):
    AS_OF = date(2026, 9, 28)

    def _run(self, responses: list[str]) -> dict:
        calls = iter(responses)
        with patch("advisor.load_reference_data", return_value=REF):
            return get_addon_advice(
                CRETA, "Mumbai", None, as_of=self.AS_OF, chat=lambda _m: next(calls),
                claim_free_years=3,
            )

    def _all_available(self, result_available: list[dict], price_override: dict[str, float] | None = None) -> str:
        recs = [
            {"name": a["addon_name"], "price": float((price_override or {}).get(a["addon_name"], a["price"])),
             "reasoning": "Fits this vehicle."}
            for a in result_available
        ]
        return json.dumps(advice(recs))

    def test_retry_then_success(self) -> None:
        with patch("advisor.load_reference_data", return_value=REF):
            base = get_addon_advice(
                CRETA, "Mumbai", None, as_of=self.AS_OF, chat=lambda _m: "not json",
                claim_free_years=3,
            )
        available = base["available_addons"]
        result = self._run([
            self._all_available(available, {"zero_depreciation": 1.0}),
            self._all_available(available),
        ])
        self.assertEqual(result["source"], "ai")
        self.assertEqual(len(result["recommendations"]), 6)
        self.assertEqual(result["recommended_total"], D("14008.00"))
        self.assertTrue(any("Attempt 1 rejected" in n for n in result["validation_notes"]))

    def test_falls_back_to_rules_after_two_bad_responses(self) -> None:
        result = self._run(["not json", json.dumps(advice([{"name": "made_up", "price": 1, "reasoning": "x"}]))])
        self.assertEqual(result["source"], "rules_fallback")
        self.assertEqual(result["recommended_total"], D("14008.00"))
        self.assertEqual(len(result["validation_notes"]), 3)


if __name__ == "__main__":
    unittest.main()
